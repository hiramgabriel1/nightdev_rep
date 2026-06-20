variable "do_token" {
  description = "DigitalOcean API token"
  type        = string
  sensitive   = true
}

variable "ssh_key_name" {
  description = "Name of the SSH key in DigitalOcean"
  type        = string
  default     = "nightdev"
}

variable "region" {
  description = "DigitalOcean region"
  type        = string
  default     = "nyc1"
}

variable "droplet_size" {
  description = "Droplet plan slug"
  type        = string
  default     = "s-4vcpu-8gb-intel"
}

variable "droplet_image" {
  description = "Droplet OS image"
  type        = string
  default     = "ubuntu-24-04-x64"
}
