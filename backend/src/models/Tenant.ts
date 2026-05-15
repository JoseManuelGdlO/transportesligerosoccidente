import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from "sequelize";

export class Tenant extends Model<InferAttributes<Tenant>, InferCreationAttributes<Tenant>> {
  declare id: CreationOptional<string>;
  declare slug: string;
  declare nombre: string;
  declare estatus: "activo" | "suspendido";
  declare logo_url: CreationOptional<string | null>;
  declare color_primary: CreationOptional<string | null>;
  declare color_accent: CreationOptional<string | null>;
  declare color_sidebar: CreationOptional<string | null>;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

export function initTenant(sequelize: Sequelize) {
  Tenant.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      slug: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      nombre: { type: DataTypes.STRING(255), allowNull: false },
      estatus: { type: DataTypes.ENUM("activo", "suspendido"), allowNull: false, defaultValue: "activo" },
      logo_url: { type: DataTypes.TEXT, allowNull: true },
      color_primary: { type: DataTypes.STRING(16), allowNull: true },
      color_accent: { type: DataTypes.STRING(16), allowNull: true },
      color_sidebar: { type: DataTypes.STRING(16), allowNull: true },
    } as never,
    { sequelize, tableName: "tenants", underscored: true },
  );
}
