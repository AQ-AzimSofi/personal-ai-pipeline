import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as path from 'path';

export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const styleTable = new dynamodb.Table(this, 'StyleTable', {
      tableName: 'personal-ai-pipeline-styles',
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const environment: Record<string, string> = {
      STYLE_TABLE_NAME: styleTable.tableName,
    };

    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith('GEMINI_API_KEY') && value) {
        environment[key] = value;
      }
    }

    const hasKeys = Object.keys(environment).some((k) => k.startsWith('GEMINI_API_KEY'));
    if (!hasKeys) {
      throw new Error(
        'At least one GEMINI_API_KEY_* environment variable is required for deployment'
      );
    }

    const handler = new NodejsFunction(this, 'Handler', {
      functionName: 'personal-ai-pipeline-handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, '../../lambda/src/index.ts'),
      handler: 'handler',
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment,
      bundling: {
        minify: true,
        sourceMap: true,
      },
    });

    styleTable.grantReadWriteData(handler);

    const api = new apigateway.RestApi(this, 'Api', {
      restApiName: 'personal-ai-pipeline',
      deployOptions: {
        stageName: 'prod',
      },
    });

    const generate = api.root.addResource('generate');
    generate.addMethod('POST', new apigateway.LambdaIntegration(handler));

    new cdk.CfnOutput(this, 'ApiUrl', {
      value: api.url,
    });
  }
}
