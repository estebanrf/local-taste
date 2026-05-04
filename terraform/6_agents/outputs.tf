output "lambda_functions" {
  description = "Names of deployed Lambda functions"
  value = {
    planner           = aws_lambda_function.planner.function_name
    dish_discoverer   = aws_lambda_function.dish_discoverer.function_name
    restaurant_ranker = aws_lambda_function.restaurant_ranker.function_name
  }
}

output "planner_function_name" {
  description = "Planner Lambda function name"
  value       = aws_lambda_function.planner.function_name
}

output "setup_instructions" {
  description = "Next steps after deployment"
  value = <<-EOT

    Local Taste agents deployed!

    Lambda Functions:
    - Planner (Orchestrator): ${aws_lambda_function.planner.function_name}
    - Dish Discoverer:        ${aws_lambda_function.dish_discoverer.function_name}
    - Restaurant Ranker:      ${aws_lambda_function.restaurant_ranker.function_name}

    The API invokes the Planner Lambda directly (async) — no SQS needed.

    Bedrock Model: ${var.bedrock_model_id}
    Bedrock Region: ${var.bedrock_region}
  EOT
}
