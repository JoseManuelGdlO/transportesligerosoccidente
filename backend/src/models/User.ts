import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
  type NonAttribute,
} from "sequelize";
import type { Role } from "./Role";

export class User extends Model<InferAttributes<User>, InferCreationAttributes<User>> {
  declare id: CreationOptional<string>;
  declare role_id: string;
  declare email: string;
  declare password_hash: string;
  declare nombre: string;
  declare estatus: "activo" | "inactivo";
  declare ultimo_acceso: CreationOptional<Date | null>;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;

  declare Role?: NonAttribute<Role>;
}

export function initUser(sequelize: Sequelize) {
  User.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      role_id: { type: DataTypes.CHAR(36), allowNull: false },
      email: { type: DataTypes.STRING(255), allowNull: false, unique: true },
      password_hash: { type: DataTypes.STRING(255), allowNull: false },
      nombre: { type: DataTypes.STRING(255), allowNull: false },
      estatus: { type: DataTypes.ENUM("activo", "inactivo"), allowNull: false, defaultValue: "activo" },
      ultimo_acceso: { type: DataTypes.DATE, allowNull: true },
    } as never,
    {
      sequelize,
      tableName: "users",
      underscored: true,
      timestamps: true,
      createdAt: "creado_en",
      updatedAt: "updated_at",
    },
  );
}
