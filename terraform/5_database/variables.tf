variable "aws_region" {
  description = "AWS region for resources"
  type        = string
}

variable "min_capacity" {
  description = "Minimum capacity for Aurora Serverless v2 (in ACUs). Use 0 to scale to zero when idle (saves ~$43/month, cold start ~15-30s)."
  type        = number
  default     = 0
}

variable "max_capacity" {
  description = "Maximum capacity for Aurora Serverless v2 (in ACUs)"
  type        = number
  default     = 1
}