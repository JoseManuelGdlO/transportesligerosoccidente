import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from "sequelize";

export class Role extends Model<InferAttributes<Role>, InferCreationAttributes<Role>> {
  declare id: CreationOptional<string>;
  declare slug: string;
  declare nombre: string;
  declare descripcion: CreationOptional<string | null>;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

export function initRole(sequelize: Sequelize) {
  Role.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      slug: { type: DataTypes.STRING(32), allowNull: false, unique: true },
      nombre: { type: DataTypes.STRING(128), allowNull: false },
      descripcion: { type: DataTypes.TEXT, allowNull: true },
    } as never,
    { sequelize, tableName: "roles", underscored: true },
  );
}
