import { DataTypes } from "sequelize";
import { sequelize } from "../db.js";
import User from "./User.js";

const Script = sequelize.define("Script", {
  name: { type: DataTypes.STRING, allowNull: false },
  file_path: { type: DataTypes.STRING, allowNull: false },
  language: { type: DataTypes.STRING, allowNull: false },
  userId: { type: DataTypes.INTEGER, allowNull: true }
});

Script.belongsTo(User, { foreignKey: "userId" });
User.hasMany(Script, { foreignKey: "userId" });

export default Script;