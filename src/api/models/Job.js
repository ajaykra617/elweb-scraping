import { DataTypes } from 'sequelize';
import { sequelize } from '../db.js';
import User from './User.js';

const Job = sequelize.define('Job', {
  inputFile: { type: DataTypes.STRING, allowNull: true },
  totalItems: { type: DataTypes.INTEGER, allowNull: true },
  status: { type: DataTypes.STRING, defaultValue: 'queued' },
  resultPath: { type: DataTypes.STRING, allowNull: true },
  resultFileName: { type: DataTypes.STRING, allowNull: true },
  successCount: { type: DataTypes.INTEGER, allowNull: true },
  failedCount: { type: DataTypes.INTEGER, allowNull: true },
  startedAt: { type: DataTypes.DATE, allowNull: true },
  finishedAt: { type: DataTypes.DATE, allowNull: true }
});

Job.belongsTo(User);
User.hasMany(Job);

export default Job;
