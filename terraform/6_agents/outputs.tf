output "lambda_functions" {
  description = "Names of deployed Lambda functions"
  value = {
    dish_discoverer   = aws_lambda_function.dish_discoverer.function_name
    restaurant_ranker = aws_lambda_function.restaurant_ranker.function_name
  }
}

output "dish_discoverer_function_name" {
  description = "Dish Discoverer Lambda function name"
  value       = aws_lambda_function.dish_discoverer.function_name
}

output "restaurant_ranker_function_name" {
  description = "Restaurant Ranker Lambda function name"
  value       = aws_lambda_function.restaurant_ranker.function_name
}

output "setup_instructions" {
  description = "Next steps after deployment"
  value = <<-EOT

    Local Taste agents deployed!

    Lambda Functions:
    - Dish Discoverer:   ${aws_lambda_function.dish_discoverer.function_name}
    - Restaurant Ranker: ${aws_lambda_function.restaurant_ranker.function_name}

    The API invokes these directly (async) — no SQS, no planner.

    Bedrock Model: ${var.bedrock_model_id}
    Bedrock Region: ${var.bedrock_region}
  EOT
}
