import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from "sequelize";

export class Permission extends Model<InferAttributes<Permission>, InferCreationAttributes<Permission>> {
  declare id: CreationOptional<string>;
  declare slug: string;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

export function initPermission(sequelize: Sequelize) {
  Permission.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      slug: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    } as never,
    { sequelize, tableName: "permissions", underscored: true },
  );
}
