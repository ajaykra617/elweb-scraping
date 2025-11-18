import { DataTypes } from "sequelize";
import { sequelize } from "../db.js";
import User from "./User.js";
import Script from "./Script.js";

const Job = sequelize.define("Job", {
  // ───────────────────────────────────────────────────────────────
  // LEGACY FIELDS — KEEP FOR BACKWARD COMPATIBILITY
  // ───────────────────────────────────────────────────────────────
  inputFile: { type: DataTypes.STRING, allowNull: true },            // old simple job input
  resultPath: { type: DataTypes.STRING, allowNull: true },           // old jobs
  resultFileName: { type: DataTypes.STRING, allowNull: true },       // old jobs

  // STATUS / METRICS (legacy)
  status: { type: DataTypes.STRING, defaultValue: "queued" },
  totalItems: { type: DataTypes.INTEGER, allowNull: true },          // older jobs use this
  successCount: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
  failedCount: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },

  startedAt: { type: DataTypes.DATE, allowNull: true },
  finishedAt: { type: DataTypes.DATE, allowNull: true },

  // ───────────────────────────────────────────────────────────────
  // USER RELATION — DO NOT CHANGE (userId)
  // ───────────────────────────────────────────────────────────────
  userId: { type: DataTypes.INTEGER, allowNull: true },

  // ───────────────────────────────────────────────────────────────
  // NEW FIELDS FOR SCALABLE BATCH PROCESSING
  // ───────────────────────────────────────────────────────────────

  // Type of job: simple, batch, batch-row etc.
  job_type: { type: DataTypes.STRING, defaultValue: "batch" },

  // Path to user-selected script (Node/Python)
  script_id: { type: DataTypes.INTEGER, allowNull: true },
  script_path: { type: DataTypes.STRING, allowNull: true },

  // CSV file that was uploaded
  input_file_path: { type: DataTypes.STRING, allowNull: true },

  // Concurrency per worker (used only for simple jobs or whole-CSV jobs)
  concurrency: { type: DataTypes.INTEGER, defaultValue: 1 },

  // ───────────────────────────────────────────────────────────────
  // BATCH-JOB METRICS (Parent job fields)
  // ───────────────────────────────────────────────────────────────

  // for bulk ingestion, number of CSV rows (parent job)
  totalRows: { type: DataTypes.INTEGER, defaultValue: 0 },

  // how many row-jobs have been processed (atomically incremented by workers)
  processedRows: { type: DataTypes.INTEGER, defaultValue: 0 },

  // how many succeeded at row-level (different from successCount which is legacy)
  batchSuccessCount: { type: DataTypes.INTEGER, defaultValue: 0 },

  // how many failed at row-level
  batchFailedCount: { type: DataTypes.INTEGER, defaultValue: 0 },
});

// ───────────────────────────────────────────────────────────────
// RELATIONS
// ───────────────────────────────────────────────────────────────

// userId → User
Job.belongsTo(User, { foreignKey: "userId" });
User.hasMany(Job, { foreignKey: "userId" });

// script_id → Script
Job.belongsTo(Script, { foreignKey: "script_id" });
Script.hasMany(Job, { foreignKey: "script_id" });

export default Job;
