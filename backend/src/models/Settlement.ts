import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from "sequelize";

export class Settlement extends Model<InferAttributes<Settlement>, InferCreationAttributes<Settlement>> {
  declare id: CreationOptional<string>;
  declare driver_id: string;
  declare fecha_inicio: string;
  declare fecha_fin: string;
  declare cerrado: CreationOptional<boolean>;
  declare cerrado_at: CreationOptional<Date | null>;
  declare snapshot: CreationOptional<Record<string, unknown> | null>;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

export function initSettlement(sequelize: Sequelize) {
  Settlement.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      driver_id: { type: DataTypes.CHAR(36), allowNull: false },
      fecha_inicio: { type: DataTypes.DATEONLY, allowNull: false },
      fecha_fin: { type: DataTypes.DATEONLY, allowNull: false },
      cerrado: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      cerrado_at: { type: DataTypes.DATE, allowNull: true },
      snapshot: { type: DataTypes.JSON, allowNull: true },
    } as never,
    { sequelize, tableName: "settlements", underscored: true },
  );
}
