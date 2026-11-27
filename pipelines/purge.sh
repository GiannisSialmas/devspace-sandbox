# Sourced by `pipelines: purge:` in devspace.yaml, so DevSpace's pipeline functions work here.
# DevSpace doesn't fill in ${VAR} in this file; plain env vars like $DEVSPACE_NAMESPACE do work.
# The default purge, plus deleting the admin password Secret: `purge_deployments` only removes
# what's under deployments: (k8s/ and the Ingress), and the Secret comes from `devspace run set-admin-token`.
stop_dev --all
purge_deployments --all
kubectl -n "$DEVSPACE_NAMESPACE" delete secret backend-admin --ignore-not-found
run_dependencies --all --pipeline purge
