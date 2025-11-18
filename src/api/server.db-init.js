import { sequelize } from './db.js';
import User from './models/User.js';
import Job from './models/Job.js';

export const initDB = async () => {
  try {
    await sequelize.authenticate();
    await sequelize.sync({ alter: true });
    console.log('✅ PostgreSQL connected & models synced');
  } catch (err) {
    console.error('❌ DB Connection Error:', err);
  }
};
