terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

data "aws_caller_identity" "current" {}

# ── SQS Queue ─────────────────────────────────────────────────────────────────

resource "aws_sqs_queue" "jobs" {
  name                       = "localtaste-jobs"
  delay_seconds              = 0
  max_message_size           = 262144
  message_retention_seconds  = 86400
  receive_wait_time_seconds  = 10
  visibility_timeout_seconds = 910

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.jobs_dlq.arn
    maxReceiveCount     = 3
  })

  tags = { Project = "localtaste", Part = "6" }
}

resource "aws_sqs_queue" "jobs_dlq" {
  name = "localtaste-jobs-dlq"
  tags = { Project = "localtaste", Part = "6" }
}

# ── IAM Role ──────────────────────────────────────────────────────────────────

resource "aws_iam_role" "lambda_role" {
  name = "localtaste-lambda-agents-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })

  tags = { Project = "localtaste", Part = "6" }
}

resource "aws_iam_role_policy" "lambda_policy" {
  name = "localtaste-lambda-agents-policy"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:*"
      },
      {
        Effect   = "Allow"
        Action   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
        Resource = aws_sqs_queue.jobs.arn
      },
      {
        Effect   = "Allow"
        Action   = ["lambda:InvokeFunction"]
        Resource = "arn:aws:lambda:${var.aws_region}:${data.aws_caller_identity.current.account_id}:function:localtaste-*"
      },
      {
        Effect   = "Allow"
        Action   = ["rds-data:ExecuteStatement", "rds-data:BatchExecuteStatement", "rds-data:BeginTransaction", "rds-data:CommitTransaction", "rds-data:RollbackTransaction"]
        Resource = var.aurora_cluster_arn
      },
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = var.aurora_secret_arn
      },
      {
        Effect   = "Allow"
        Action   = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
        Resource = ["arn:aws:bedrock:*::foundation-model/*", "arn:aws:bedrock:*:*:inference-profile/*"]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# ── S3 bucket for Lambda packages ─────────────────────────────────────────────

resource "aws_s3_bucket" "lambda_packages" {
  bucket = "localtaste-lambda-packages-${data.aws_caller_identity.current.account_id}"
  tags   = { Project = "localtaste", Part = "6" }
}

locals {
  agents = ["planner", "reporter", "charter"]
}

resource "aws_s3_object" "lambda_packages" {
  for_each = toset(local.agents)

  bucket = aws_s3_bucket.lambda_packages.id
  key    = "${each.key}/${each.key}_lambda.zip"
  source = "${path.module}/../../backend/${each.key}/${each.key}_lambda.zip"
  etag   = fileexists("${path.module}/../../backend/${each.key}/${each.key}_lambda.zip") ? filemd5("${path.module}/../../backend/${each.key}/${each.key}_lambda.zip") : null

  tags = { Project = "localtaste", Part = "6", Agent = each.key }
}

# ── Lambda common env ─────────────────────────────────────────────────────────

locals {
  common_env = {
    AURORA_CLUSTER_ARN     = var.aurora_cluster_arn
    AURORA_SECRET_ARN      = var.aurora_secret_arn
    DATABASE_NAME          = "localtaste"
    BEDROCK_MODEL_ID       = var.bedrock_model_id
    BEDROCK_REGION         = var.bedrock_region
    DEFAULT_AWS_REGION     = var.aws_region
    LANGFUSE_PUBLIC_KEY    = var.langfuse_public_key
    LANGFUSE_SECRET_KEY    = var.langfuse_secret_key
    LANGFUSE_HOST          = var.langfuse_host
    OPENAI_API_KEY         = var.openai_api_key
  }
}

# ── Planner (Orchestrator) ─────────────────────────────────────────────────────

resource "aws_lambda_function" "planner" {
  function_name    = "localtaste-planner"
  role             = aws_iam_role.lambda_role.arn
  s3_bucket        = aws_s3_bucket.lambda_packages.id
  s3_key           = aws_s3_object.lambda_packages["planner"].key
  source_code_hash = fileexists("${path.module}/../../backend/planner/planner_lambda.zip") ? filebase64sha256("${path.module}/../../backend/planner/planner_lambda.zip") : null
  handler          = "lambda_handler.lambda_handler"
  runtime          = "python3.12"
  timeout          = 900
  memory_size      = 2048

  environment {
    variables = merge(local.common_env, {
      DISH_DISCOVERER_FUNCTION   = "localtaste-dish-discoverer"
      RESTAURANT_RANKER_FUNCTION = "localtaste-restaurant-ranker"
    })
  }

  tags       = { Project = "localtaste", Part = "6", Agent = "planner" }
  depends_on = [aws_s3_object.lambda_packages["planner"]]
}

resource "aws_lambda_event_source_mapping" "planner_sqs" {
  event_source_arn = aws_sqs_queue.jobs.arn
  function_name    = aws_lambda_function.planner.arn
  batch_size       = 1
}

# ── Dish Discoverer (reporter dir) ────────────────────────────────────────────

resource "aws_lambda_function" "dish_discoverer" {
  function_name    = "localtaste-dish-discoverer"
  role             = aws_iam_role.lambda_role.arn
  s3_bucket        = aws_s3_bucket.lambda_packages.id
  s3_key           = aws_s3_object.lambda_packages["reporter"].key
  source_code_hash = fileexists("${path.module}/../../backend/reporter/reporter_lambda.zip") ? filebase64sha256("${path.module}/../../backend/reporter/reporter_lambda.zip") : null
  handler          = "lambda_handler.lambda_handler"
  runtime          = "python3.12"
  timeout          = 300
  memory_size      = 1024

  environment { variables = local.common_env }

  tags       = { Project = "localtaste", Part = "6", Agent = "dish-discoverer" }
  depends_on = [aws_s3_object.lambda_packages["reporter"]]
}

# ── Restaurant Ranker (charter dir) ───────────────────────────────────────────

resource "aws_lambda_function" "restaurant_ranker" {
  function_name    = "localtaste-restaurant-ranker"
  role             = aws_iam_role.lambda_role.arn
  s3_bucket        = aws_s3_bucket.lambda_packages.id
  s3_key           = aws_s3_object.lambda_packages["charter"].key
  source_code_hash = fileexists("${path.module}/../../backend/charter/charter_lambda.zip") ? filebase64sha256("${path.module}/../../backend/charter/charter_lambda.zip") : null
  handler          = "lambda_handler.lambda_handler"
  runtime          = "python3.12"
  timeout          = 300
  memory_size      = 1024

  environment { variables = local.common_env }

  tags       = { Project = "localtaste", Part = "6", Agent = "restaurant-ranker" }
  depends_on = [aws_s3_object.lambda_packages["charter"]]
}

# ── CloudWatch Log Groups ─────────────────────────────────────────────────────

resource "aws_cloudwatch_log_group" "agent_logs" {
  for_each          = toset(["planner", "dish-discoverer", "restaurant-ranker"])
  name              = "/aws/lambda/localtaste-${each.key}"
  retention_in_days = 7
  tags              = { Project = "localtaste", Part = "6" }
}
