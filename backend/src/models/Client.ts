import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from "sequelize";

export class Client extends Model<InferAttributes<Client>, InferCreationAttributes<Client>> {
  declare id: CreationOptional<string>;
  declare tenant_id: string;
  declare razon_social: string;
  declare rfc: string;
  declare contacto: string;
  declare telefono: string;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

export function initClient(sequelize: Sequelize) {
  Client.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      tenant_id: { type: DataTypes.CHAR(36), allowNull: false },
      razon_social: { type: DataTypes.STRING(255), allowNull: false },
      rfc: { type: DataTypes.STRING(32), allowNull: false },
      contacto: { type: DataTypes.STRING(255), allowNull: false },
      telefono: { type: DataTypes.STRING(64), allowNull: false },
    } as never,
    { sequelize, tableName: "clients", underscored: true },
  );
}
