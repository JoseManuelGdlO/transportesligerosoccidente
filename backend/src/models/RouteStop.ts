import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from "sequelize";

export class RouteStop extends Model<InferAttributes<RouteStop>, InferCreationAttributes<RouteStop>> {
  declare id: CreationOptional<string>;
  declare route_id: string;
  declare orden: number;
  declare etiqueta: string;
  declare client_ubicacion_id: CreationOptional<string | null>;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

export function initRouteStop(sequelize: Sequelize) {
  RouteStop.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      route_id: { type: DataTypes.CHAR(36), allowNull: false },
      orden: { type: DataTypes.INTEGER, allowNull: false },
      etiqueta: { type: DataTypes.STRING(255), allowNull: false },
      client_ubicacion_id: { type: DataTypes.CHAR(36), allowNull: true },
    } as never,
    { sequelize, tableName: "route_stops", underscored: true },
  );
}
