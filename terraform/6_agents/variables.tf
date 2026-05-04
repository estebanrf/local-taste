variable "aws_region" {
  description = "AWS region for resources"
  type        = string
}

variable "aurora_cluster_arn" {
  description = "ARN of the Aurora cluster (from Part 5)"
  type        = string
}

variable "aurora_secret_arn" {
  description = "ARN of the Secrets Manager secret (from Part 5)"
  type        = string
}

variable "bedrock_model_id" {
  description = "Bedrock model ID for agents (e.g. us.amazon.nova-pro-v1:0)"
  type        = string
  default     = "us.amazon.nova-pro-v1:0"
}

variable "bedrock_region" {
  description = "AWS region where Bedrock inference runs"
  type        = string
}

# LangFuse observability (optional)
variable "langfuse_public_key" {
  type    = string
  default = ""
}

variable "langfuse_secret_key" {
  type      = string
  default   = ""
  sensitive = true
}

variable "langfuse_host" {
  type    = string
  default = "https://us.cloud.langfuse.com"
}

variable "openai_api_key" {
  description = "OpenAI API key for OpenAI Agents SDK tracing"
  type        = string
  default     = ""
  sensitive   = true
}
