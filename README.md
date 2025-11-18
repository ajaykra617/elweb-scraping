# elweb-scraping (v6)

## Quick start (WSL / Linux)

1. Unzip and enter folder:
   ```
   unzip elweb-scraping-v6.zip -d ~/elweb-scraping
   cd ~/elweb-scraping
   ```

2. Build & run:
   ```
   docker compose up --build
   ```

3. Test endpoints:
   ```
   curl http://localhost:8000/test/node
   curl http://localhost:8000/test/python
   ```

4. Logs/results:
   - Worker output is printed to container logs.
   - Detailed job logs are written to `storage/results/{jobid}.log` (mounted into host).

## Notes
- Images include `curl` and `ping` for debugging.
- Node's `package.json` includes required dependencies.
- The Node worker will spawn Python scripts for python jobs.
