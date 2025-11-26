from fastapi import FastAPI
from pydantic import BaseModel
from runner import run_user_script

app = FastAPI()

class PythonTask(BaseModel):
    script_path: str
    rowData: dict
    jobId: int
    rowIndex: int
    resultFile: str
    logFile: str

@app.post("/run")
async def run(task: PythonTask):
    result = await run_user_script(
        task.script_path,
        task.rowData,
        task.jobId,
        task.rowIndex,
        task.resultFile,
        task.logFile
    )

    return {
        "code": result.get("code", 1),
        "out": result.get("out", ""),
        "err": result.get("err", "")
    }