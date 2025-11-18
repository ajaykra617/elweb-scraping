import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';
dotenv.config();

export const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
});
// ADD THIS:
// await sequelize.sync({ alter: true });
// console.log("📦 Database synced successfully");
export default sequelize;
