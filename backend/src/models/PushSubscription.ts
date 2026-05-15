import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from "sequelize";

export class PushSubscription extends Model<
  InferAttributes<PushSubscription>,
  InferCreationAttributes<PushSubscription>
> {
  declare id: CreationOptional<string>;
  declare tenant_id: string;
  declare user_id: string;
  declare endpoint: string;
  declare p256dh: string;
  declare auth: string;
  declare user_agent: CreationOptional<string | null>;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

export function initPushSubscription(sequelize: Sequelize) {
  PushSubscription.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      tenant_id: { type: DataTypes.CHAR(36), allowNull: false },
      user_id: { type: DataTypes.CHAR(36), allowNull: false },
      endpoint: { type: DataTypes.STRING(768), allowNull: false, unique: true },
      p256dh: { type: DataTypes.TEXT, allowNull: false },
      auth: { type: DataTypes.TEXT, allowNull: false },
      user_agent: { type: DataTypes.TEXT, allowNull: true },
    } as never,
    { sequelize, tableName: "push_subscriptions", underscored: true },
  );
}
