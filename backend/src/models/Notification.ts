import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from "sequelize";

export type NotificationPayload = Record<string, unknown>;

export class Notification extends Model<InferAttributes<Notification>, InferCreationAttributes<Notification>> {
  declare id: CreationOptional<string>;
  declare tenant_id: string;
  declare user_id: string;
  declare tipo: string;
  declare payload: NotificationPayload;
  declare document_id: CreationOptional<string | null>;
  declare alert_date: string;
  declare leida: CreationOptional<boolean>;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

export function initNotification(sequelize: Sequelize) {
  Notification.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      tenant_id: { type: DataTypes.CHAR(36), allowNull: false },
      user_id: { type: DataTypes.CHAR(36), allowNull: false },
      tipo: { type: DataTypes.STRING(64), allowNull: false },
      payload: { type: DataTypes.JSON, allowNull: false },
      document_id: { type: DataTypes.CHAR(36), allowNull: true },
      alert_date: { type: DataTypes.DATEONLY, allowNull: false },
      leida: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    } as never,
    { sequelize, tableName: "notifications", underscored: true },
  );
}
