output "droplet_ip" {
  value       = digitalocean_droplet.nightdev.ipv4_address
  description = "Public IP of the VPS"
}

output "droplet_urn" {
  value       = digitalocean_droplet.nightdev.urn
  description = "Droplet URN for tagging"
}
