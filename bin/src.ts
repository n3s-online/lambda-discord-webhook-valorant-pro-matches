#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { TypescriptLambdaStack } from '../lib/typescript-lambda-stack';
import { config } from 'dotenv';
import { EnvironmentVariables } from '../src/lambdaHandler';
import { CronOptions } from 'aws-cdk-lib/aws-events';
config();

const app = new cdk.App();

const environment: EnvironmentVariables = {
  DISCORD_WEBHOOK_URL: process.env.DISCORD_WEBHOOK_URL!,
  DISCORD_WEBHOOK_USERNAME: process.env.DISCORD_WEBHOOK_AVATAR_URL ?? process.env.DISCORD_WEBHOOK_USERNAME
};

// Cron Rule is in UTC (currently 8AM PST)
const cronRule: CronOptions = {
  hour: '15',
  minute: '00'
};

new TypescriptLambdaStack(app, 'VlrTypescriptLambdaStack', {
  environment,
  cronRule
});