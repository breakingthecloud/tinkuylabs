/**
 * Deterministic Ontology-Driven AWS — CDK Stack
 *
 * Tokenops-002 deploy path. Wires the reference architecture:
 *
 *   Step Functions (DAG) → sayay-guard-interceptor → styrr-llm-router
 *     → bedrock-strands-runtime → tinkuy-neptune-validator
 *
 * plus the DynamoDB global budget table and a Neptune cluster security
 * group (cluster itself is user-provided per the SoW).
 *
 * The state machine is constructed programmatically from the real Lambda
 * ARNs (instead of the templated `state-machine.asl.json`) so `cdk deploy`
 * works out of the box. The `.asl.json` stays as the human-readable
 * reference spec.
 */

import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface DeterministicOntologyStackProps extends cdk.StackProps {
  /** Neptune cluster ARN to allow the validator Lambda to reach (optional). */
  neptuneClusterArn?: string;
  /** Daily budget per user in USD (default 5). */
  dailyBudgetUsd?: number;
}

export class DeterministicOntologyStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DeterministicOntologyStackProps = {}) {
    super(scope, id, props);

    // ── DynamoDB budget table (sayay storage) ──
    const budgetTable = new dynamodb.Table(this, 'BudgetTable', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // ── Lambda blueprints ──
    const sayayInterceptor = new lambda.Function(this, 'SayayGuardInterceptor', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler.handler',
      code: lambda.Code.fromAsset('../lambdas/sayay-guard-interceptor'),
      environment: {
        BUDGET_TABLE: budgetTable.tableName,
        DAILY_USD: String(props.dailyBudgetUsd ?? 5),
        PER_CALL_MAX_USD: '0.1',
      },
    });
    budgetTable.grantReadWriteData(sayayInterceptor);

    const styrrRouter = new lambda.Function(this, 'StyrrLlmRouter', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler.handler',
      code: lambda.Code.fromAsset('../lambdas/styrr-llm-router'),
      environment: {
        OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ?? '',
        AWS_REGION: this.region,
      },
    });

    const tinkuyValidator = new lambda.Function(this, 'TinkuyNeptuneValidator', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler.handler',
      code: lambda.Code.fromAsset('../lambdas/tinkuy-neptune-validator'),
      timeout: cdk.Duration.seconds(30),
    });

    // ── Neptune security group (allows validator → Neptune on 8182) ──
    const vpc = ec2.Vpc.fromLookup(this, 'DefaultVpc', { isDefault: true });
    const neptuneSg = new ec2.SecurityGroup(this, 'NeptuneSg', {
      vpc,
      allowAllOutbound: true,
    });
    neptuneSg.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(8182),
      'Allow validator Lambda to query Neptune Gremlin/SPARQL',
    );

    if (props.neptuneClusterArn) {
      tinkuyValidator.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['neptune-db:connect'],
          resources: [props.neptuneClusterArn],
        }),
      );
    }

    // ── Step Functions state machine (programmatic, real ARNs) ──
    const evaluateGuardrail = new tasks.LambdaInvoke(this, 'EvaluateFinancialGuardrail', {
      lambdaFunction: sayayInterceptor,
      outputPath: '$',
    });

    const routeInference = new tasks.LambdaInvoke(this, 'RouteInferenceLoadBalancer', {
      lambdaFunction: styrrRouter,
      resultPath: '$.inference_payload',
    });

    const executeStrands = new tasks.LambdaInvoke(this, 'ExecuteBedrockStrandsAgent', {
      lambdaFunction: new lambda.Function(this, 'BedrockStrandsRuntime', {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'handler.handler',
        code: lambda.Code.fromAsset('../lambdas/styrr-llm-router'),
        environment: { AWS_REGION: this.region },
      }),
      payload: sfn.TaskInput.fromObject({ 'Payload.$': '$.inference_payload' }),
      resultPath: '$.raw_agent_response',
    });

    const validateOntology = new tasks.LambdaInvoke(this, 'ValidateOntologyWithTinkuy', {
      lambdaFunction: tinkuyValidator,
      payload: sfn.TaskInput.fromObject({
        'AgentOutput.$': '$.raw_agent_response',
        NeptuneEndpoint: props.neptuneClusterArn ?? 'user-provided',
      }),
      resultPath: '$.validation',
    });

    const killSwitch = new sfn.Fail(this, 'FinancialKillSwitchTriggered', {
      error: 'BudgetExceeded',
      cause:
        'Gasto financiero excedido en el Strand actual. Ejecución detenida de forma determinística por sayay-guard.',
    });

    const handleHallucination = new tasks.LambdaInvoke(this, 'HandleHallucinationError', {
      lambdaFunction: styrrRouter,
      resultPath: '$.escalated',
      comment: 'Alucinación detectada por tinkuy. Se escala a un modelo de razonamiento superior.',
    });

    // Catch blocks mirror the ASL ErrorEquals matchers
    evaluateGuardrail.addCatch(killSwitch, {
      errors: ['TokenBudgetExceededException'],
    });
    validateOntology.addCatch(handleHallucination, {
      errors: ['OntologyViolationException'],
      resultPath: '$.escalated',
    });

    const definition = evaluateGuardrail
      .next(routeInference)
      .next(executeStrands)
      .next(validateOntology);

    const stateMachine = new sfn.StateMachine(this, 'DeterministicOntologyMachine', {
      definition,
      timeout: cdk.Duration.minutes(10),
    });

    // Expose for tests / docs
    new cdk.CfnOutput(this, 'StateMachineArn', { value: stateMachine.stateMachineArn });
    new cdk.CfnOutput(this, 'BudgetTableName', { value: budgetTable.tableName });
    new cdk.CfnOutput(this, 'NeptuneSgId', { value: neptuneSg.securityGroupId });
  }
}

const app = new cdk.App();
new DeterministicOntologyStack(app, 'DeterministicOntologyStack');
