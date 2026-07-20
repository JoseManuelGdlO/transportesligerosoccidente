import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from "sequelize";

export class Supplier extends Model<InferAttributes<Supplier>, InferCreationAttributes<Supplier>> {
  declare id: CreationOptional<string>;
  declare tenant_id: string;
  declare razon_social: string;
  declare rfc: CreationOptional<string | null>;
  declare contacto: CreationOptional<string | null>;
  declare telefono: CreationOptional<string | null>;
  declare email: CreationOptional<string | null>;
  declare dias_credito: CreationOptional<number | null>;
  declare estatus: CreationOptional<"activo" | "inactivo">;
  declare observaciones: CreationOptional<string | null>;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

export function initSupplier(sequelize: Sequelize) {
  Supplier.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      tenant_id: { type: DataTypes.CHAR(36), allowNull: false },
      razon_social: { type: DataTypes.STRING(255), allowNull: false },
      rfc: { type: DataTypes.STRING(32), allowNull: true },
      contacto: { type: DataTypes.STRING(255), allowNull: true },
      telefono: { type: DataTypes.STRING(64), allowNull: true },
      email: { type: DataTypes.STRING(255), allowNull: true },
      dias_credito: { type: DataTypes.INTEGER, allowNull: true },
      estatus: {
        type: DataTypes.ENUM("activo", "inactivo"),
        allowNull: false,
        defaultValue: "activo",
      },
      observaciones: { type: DataTypes.TEXT, allowNull: true },
    } as never,
    { sequelize, tableName: "suppliers", underscored: true },
  );
}
