import subprocess
import json
import asyncio

async def run_user_script(script_path, rowData, jobId, rowIndex, resultFile, logFile):
    args = [
        "python3",
        script_path,
        json.dumps(rowData),
        f"--resultFile={resultFile}",
        f"--logFile={logFile}"
    ]

    proc = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )

    stdout, stderr = await proc.communicate()

    return {
        "code": proc.returncode,
        "out": stdout.decode(),
        "err": stderr.decode()
    }