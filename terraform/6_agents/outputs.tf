output "sqs_queue_url" {
  description = "URL of the SQS jobs queue"
  value       = aws_sqs_queue.jobs.url
}

output "sqs_queue_arn" {
  description = "ARN of the SQS jobs queue"
  value       = aws_sqs_queue.jobs.arn
}

output "lambda_functions" {
  description = "Names of deployed Lambda functions"
  value = {
    planner            = aws_lambda_function.planner.function_name
    dish_discoverer    = aws_lambda_function.dish_discoverer.function_name
    restaurant_ranker  = aws_lambda_function.restaurant_ranker.function_name
  }
}

output "setup_instructions" {
  description = "Next steps after deployment"
  value = <<-EOT

    Local Taste agents deployed!

    Lambda Functions:
    - Planner (Orchestrator): ${aws_lambda_function.planner.function_name}
    - Dish Discoverer:        ${aws_lambda_function.dish_discoverer.function_name}
    - Restaurant Ranker:      ${aws_lambda_function.restaurant_ranker.function_name}

    SQS Queue: ${aws_sqs_queue.jobs.name}

    To deploy code:
      cd backend/planner  && uv run package_docker.py --deploy
      cd backend/reporter && uv run package_docker.py --deploy
      cd backend/charter  && uv run package_docker.py --deploy

    Bedrock Model: ${var.bedrock_model_id}
    Bedrock Region: ${var.bedrock_region}
  EOT
}
