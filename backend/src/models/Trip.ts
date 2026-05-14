import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
  type NonAttribute,
} from "sequelize";
import type { Truck } from "./Truck";
import type { Driver } from "./Driver";
import type { Client } from "./Client";
import type { FuelLoad } from "./FuelLoad";
import type { Expense } from "./Expense";

export class Trip extends Model<InferAttributes<Trip>, InferCreationAttributes<Trip>> {
  declare id: CreationOptional<string>;
  declare folio: string;
  declare truck_id: string;
  declare driver_id: string;
  declare client_id: string;
  declare origen: string;
  declare destino: string;
  declare fecha_salida: Date;
  declare fecha_llegada: CreationOptional<Date | null>;
  declare km_inicial: number;
  declare km_final: CreationOptional<number | null>;
  declare tarifa: string;
  declare viaticos_entregados: string;
  declare num_factura: CreationOptional<string | null>;
  declare comision_override: CreationOptional<string | null>;
  declare estatus: "en_curso" | "cerrado";
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;

  declare Truck?: NonAttribute<Truck>;
  declare Driver?: NonAttribute<Driver>;
  declare Client?: NonAttribute<Client>;
  declare fuel?: NonAttribute<FuelLoad[]>;
  declare expenses?: NonAttribute<Expense[]>;
}

export function initTrip(sequelize: Sequelize) {
  Trip.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      folio: { type: DataTypes.STRING(32), allowNull: false, unique: true },
      truck_id: { type: DataTypes.CHAR(36), allowNull: false },
      driver_id: { type: DataTypes.CHAR(36), allowNull: false },
      client_id: { type: DataTypes.CHAR(36), allowNull: false },
      origen: { type: DataTypes.STRING(255), allowNull: false },
      destino: { type: DataTypes.STRING(255), allowNull: false },
      fecha_salida: { type: DataTypes.DATE, allowNull: false },
      fecha_llegada: { type: DataTypes.DATE, allowNull: true },
      km_inicial: { type: DataTypes.INTEGER, allowNull: false },
      km_final: { type: DataTypes.INTEGER, allowNull: true },
      tarifa: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      viaticos_entregados: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
      num_factura: { type: DataTypes.STRING(64), allowNull: true },
      comision_override: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
      estatus: { type: DataTypes.ENUM("en_curso", "cerrado"), allowNull: false, defaultValue: "en_curso" },
    } as never,
    { sequelize, tableName: "trips", underscored: true },
  );
}
