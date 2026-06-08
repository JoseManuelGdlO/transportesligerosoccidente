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

export type FuelTicketOrigen = "manual" | "import_excel" | "api";

export class FuelTicket extends Model<
  InferAttributes<FuelTicket>,
  InferCreationAttributes<FuelTicket>
> {
  declare id: CreationOptional<string>;
  declare tenant_id: string;
  declare truck_id: string;
  declare fecha: string;
  declare hora: CreationOptional<string | null>;
  declare folio: CreationOptional<string | null>;
  declare tag: CreationOptional<string | null>;
  declare numero_economico_raw: CreationOptional<string | null>;
  declare placas_raw: CreationOptional<string | null>;
  declare odometro: number;
  declare litros: string;
  declare precio_litro: string;
  declare importe_total: string;
  declare ubicacion: string;
  declare origen: FuelTicketOrigen;
  declare external_id: CreationOptional<string | null>;
  declare prorrateo_confirmado_at: CreationOptional<Date | null>;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;

  declare Truck?: NonAttribute<Truck>;
}

export function initFuelTicket(sequelize: Sequelize) {
  FuelTicket.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      tenant_id: { type: DataTypes.CHAR(36), allowNull: false },
      truck_id: { type: DataTypes.CHAR(36), allowNull: false },
      fecha: { type: DataTypes.DATEONLY, allowNull: false },
      hora: { type: DataTypes.TIME, allowNull: true },
      folio: { type: DataTypes.STRING(32), allowNull: true },
      tag: { type: DataTypes.STRING(64), allowNull: true },
      numero_economico_raw: { type: DataTypes.STRING(64), allowNull: true },
      placas_raw: { type: DataTypes.STRING(32), allowNull: true },
      odometro: { type: DataTypes.INTEGER, allowNull: false },
      litros: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      precio_litro: { type: DataTypes.DECIMAL(12, 4), allowNull: false },
      importe_total: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      ubicacion: { type: DataTypes.STRING(255), allowNull: false, defaultValue: "Gasolinera" },
      origen: {
        type: DataTypes.ENUM("manual", "import_excel", "api"),
        allowNull: false,
        defaultValue: "manual",
      },
      external_id: { type: DataTypes.STRING(128), allowNull: true },
      prorrateo_confirmado_at: { type: DataTypes.DATE, allowNull: true },
    } as never,
    {
      sequelize,
      tableName: "fuel_tickets",
      underscored: true,
      indexes: [
        {
          name: "fuel_tickets_tenant_folio_unique",
          unique: true,
          fields: ["tenant_id", "folio"],
        },
        {
          name: "fuel_tickets_dedup_idx",
          unique: true,
          fields: ["tenant_id", "truck_id", "fecha", "odometro", "litros"],
        },
        { name: "fuel_tickets_truck_fecha_idx", fields: ["tenant_id", "truck_id", "fecha"] },
      ],
    },
  );
}
