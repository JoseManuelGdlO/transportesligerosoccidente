import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from "sequelize";

export class TripStop extends Model<InferAttributes<TripStop>, InferCreationAttributes<TripStop>> {
  declare id: CreationOptional<string>;
  declare tenant_id: string;
  declare trip_id: string;
  declare orden: number;
  declare etiqueta: string;
  declare client_ubicacion_id: CreationOptional<string | null>;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

export function initTripStop(sequelize: Sequelize) {
  TripStop.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      tenant_id: { type: DataTypes.CHAR(36), allowNull: false },
      trip_id: { type: DataTypes.CHAR(36), allowNull: false },
      orden: { type: DataTypes.INTEGER, allowNull: false },
      etiqueta: { type: DataTypes.STRING(255), allowNull: false },
      client_ubicacion_id: { type: DataTypes.CHAR(36), allowNull: true },
    } as never,
    { sequelize, tableName: "trip_stops", underscored: true },
  );
}
