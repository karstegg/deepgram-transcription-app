---
description: Fetch logs for a Google Cloud Run service.
---

This workflow fetches the latest logs for a specified Google Cloud Run service.

**Steps:**

1.  **Identify Service Details:**
    *   `SERVICE_NAME`: The name of your Cloud Run service (e.g., `deepgram-backend`).
    *   `PROJECT_ID`: Your Google Cloud Project ID (e.g., `deepgram-transcription-app`).
    *   `REGION`: The region where your service is deployed (e.g., `us-central1`).
    *   `LIMIT` (optional): The number of log entries to retrieve (default is 10, adjust as needed).
    *   `REVISION` (optional): Specify a revision ID to filter logs for that specific revision (e.g., `deepgram-backend-00073-wdh`).

2.  **Execute the gcloud command:**
    *   Replace placeholders with your actual service details.
    *   To filter by revision, add `--revision=REVISION_ID` to the command.
    *   To filter by a time range, use the `--format` flag with `log(timestamp)` and then filter with standard shell commands, or use the `--filter` flag with a timestamp condition (e.g., `timestamp>="YYYY-MM-DDTHH:MM:SSZ"`). For simplicity in this workflow, we'll focus on recent logs and optional revision filtering.

    ```bash
    gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="SERVICE_NAME" AND resource.labels.location="REGION"' --project=PROJECT_ID --limit=LIMIT --format="json(timestamp,severity,textPayload,jsonPayload)"
    ```

    **Example for `deepgram-backend` (last 10 entries):**
    ```bash
    // turbo
    gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="deepgram-backend" AND resource.labels.location="us-central1"' --project=deepgram-transcription-app --limit=10 --format="json(timestamp,severity,textPayload,jsonPayload)"
    ```

    **Recommended command for specific revision (e.g., `deepgram-backend-00073-wdh`), including severity filter:**
    ```bash
    // turbo
    gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="deepgram-backend" AND resource.labels.location="us-central1" AND resource.labels.revision_name="deepgram-backend-00073-wdh" AND severity="ERROR"' --project=deepgram-transcription-app --limit=20 --format="json(timestamp,severity,textPayload,jsonPayload)"
    ```

3.  **Analyze Logs:** Review the output for error messages, stack traces, or any unusual activity around the time the issue occurred.
