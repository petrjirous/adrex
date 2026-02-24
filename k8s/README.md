# Kubernetes Deployment

This directory contains production-ready Kubernetes manifests for deploying adrex (API + Meilisearch).

## Prerequisites

- kubectl installed and configured
- A Kubernetes cluster
- Access to a container registry to push the API image

## Deployment steps

1. Build and push the API image

   ```bash
   docker build -t registry.example.com/adrex-api:1.0.0 .
   docker push registry.example.com/adrex-api:1.0.0
   ```

   Update `k8s/api-deployment.yaml` (and `k8s/pipeline-job.yaml`) to use your registry image.

2. Update secrets

   Generate secure keys:

   ```bash
   openssl rand -base64 32
   ```

   Replace the placeholder values in `k8s/meilisearch-secret.yaml` and `k8s/api-secret.yaml`.

3. Apply manifests (recommended order)

   ```bash
   kubectl apply -f k8s/namespace.yaml
   kubectl apply -f k8s/meilisearch-secret.yaml
   kubectl apply -f k8s/api-secret.yaml
   kubectl apply -f k8s/meilisearch-deployment.yaml  # StatefulSet with embedded PVC
   kubectl apply -f k8s/meilisearch-service.yaml
   kubectl apply -f k8s/api-deployment.yaml
   kubectl apply -f k8s/api-service.yaml
   kubectl apply -f k8s/ingress.yaml
   ```

   Note: Meilisearch uses a StatefulSet with an embedded volumeClaimTemplate. The PVC is created automatically.

4. Run the pipeline job (initial data import)

   ```bash
   kubectl apply -f k8s/pipeline-job.yaml
   ```

   The job downloads and indexes ~3M records and can take 5–10 minutes.

5. Verify deployment

   ```bash
   kubectl -n adrex get pods
   kubectl -n adrex get svc
   kubectl -n adrex describe ingress adrex-ingress
   ```

## Updating address data

Re-run the pipeline job to refresh the dataset:

```bash
kubectl delete job -n adrex adrex-pipeline
kubectl apply -f k8s/pipeline-job.yaml
```

## Scaling

- The API deployment is stateless and can be scaled horizontally (or via HPA).
- Meilisearch runs as a StatefulSet (single replica) with a persistent volume.

Example scale command:

```bash
kubectl -n adrex scale deployment adrex-api --replicas=4
```

## Monitoring

- API health: `GET /health`
- Meilisearch health: `GET /health`
- Monitor resource usage with `kubectl top pods -n adrex` (metrics-server required).

## Quick deploy

```bash
kubectl apply -f k8s/
```

Warning: update the secret placeholders before applying the manifests.
