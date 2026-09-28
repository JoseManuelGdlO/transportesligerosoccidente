import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from "sequelize";

export class TruckOdometerReset extends Model<
  InferAttributes<TruckOdometerReset>,
  InferCreationAttributes<TruckOdometerReset>
> {
  declare id: CreationOptional<string>;
  declare tenant_id: string;
  declare truck_id: string;
  declare effective_at: Date;
  declare old_km: number;
  declare new_km: number;
  declare motivo: string;
  declare created_by_user_id: CreationOptional<string | null>;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

export function initTruckOdometerReset(sequelize: Sequelize) {
  TruckOdometerReset.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      tenant_id: { type: DataTypes.CHAR(36), allowNull: false },
      truck_id: { type: DataTypes.CHAR(36), allowNull: false },
      effective_at: { type: DataTypes.DATE, allowNull: false },
      old_km: { type: DataTypes.INTEGER, allowNull: false },
      new_km: { type: DataTypes.INTEGER, allowNull: false },
      motivo: { type: DataTypes.STRING(512), allowNull: false },
      created_by_user_id: { type: DataTypes.CHAR(36), allowNull: true },
    } as never,
    { sequelize, tableName: "truck_odometer_resets", underscored: true },
  );
}
