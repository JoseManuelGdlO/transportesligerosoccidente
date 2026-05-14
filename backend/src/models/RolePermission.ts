import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from "sequelize";

export class RolePermission extends Model<
  InferAttributes<RolePermission>,
  InferCreationAttributes<RolePermission>
> {
  declare role_id: string;
  declare permission_id: string;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

export function initRolePermission(sequelize: Sequelize) {
  RolePermission.init(
    {
      role_id: { type: DataTypes.CHAR(36), primaryKey: true },
      permission_id: { type: DataTypes.CHAR(36), primaryKey: true },
    } as never,
    { sequelize, tableName: "role_permissions", underscored: true },
  );
}
