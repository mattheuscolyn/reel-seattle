#!/usr/bin/env python3
"""Publish a small redacted subset of the research shadow forecast.

Contains no source histories, fitted model weights, or private inputs. The UI
checks freshness and week alignment; the artifact alone does NOT establish a
confirmed final screening date or a production-calibrated prediction.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

SOURCE=Path("data/model_predictions/remaining_run_shadow/current.json")
TARGET=Path("public/data/a_list_run_forecast_current.json")
KEYS=("pFinalWeek","pPlus1Week","pPlus2Weeks","pPlus3PlusWeeks")

def build_public_forecast(snapshot: dict) -> dict:
    if snapshot.get("modelVersion") != "remaining_run_shadow_v1":
        raise ValueError("Unrecognized shadow forecast version")
    if not isinstance(snapshot.get("asOf"), str):
        raise ValueError("Missing forecast asOf")
    market=[]
    for row in snapshot.get("market", []):
        if not isinstance(row,dict): continue
        sid=str(row.get("sourceFilmId") or row.get("filmId") or "")
        p=[row.get(k) for k in KEYS]
        if not sid.isdecimal() or not all(isinstance(x,(int,float)) and math.isfinite(x) and 0<=x<=1 for x in p): continue
        if abs(sum(p)-1)>0.02:continue
        market.append({
            "sourceFilmId":sid,
            "currentProgrammingWeek":row.get("currentProgrammingWeek"),
            "forecastState":row.get("forecastState"),
            **{k:row[k] for k in KEYS},
        })
    return {"schema_version":1,"modelVersion":snapshot["modelVersion"],
            "asOf":snapshot["asOf"],"generatedAt":snapshot.get("generatedAt"),"market":market}

def main() -> int:
    parser=argparse.ArgumentParser()
    parser.add_argument("--source",type=Path,default=SOURCE)
    parser.add_argument("--output",type=Path,default=TARGET)
    args=parser.parse_args()
    output=build_public_forecast(json.loads(args.source.read_text(encoding="utf-8")))
    if not output["market"]:raise ValueError("No market forecast rows to export")
    args.output.parent.mkdir(parents=True,exist_ok=True)
    tmp=args.output.with_suffix(".tmp")
    tmp.write_text(json.dumps(output,indent=2)+"\n",encoding="utf-8")
    tmp.replace(args.output)
    print(f"Exported {len(output['market'])} research forecast rows; asOf {output['asOf']}")
    return 0

if __name__=="__main__":
    raise SystemExit(main())
