import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
  type NonAttribute,
} from "sequelize";
import type { AccountDocumentPayment } from "./AccountDocumentPayment";

export type AccountDocumentTipo = "cxc" | "cxp";
export type AccountDocumentEstatus = "abierta" | "pagada" | "cancelada";
export type AccountDocumentOrigen =
  | "manual"
  | "viaje"
  | "combustible"
  | "mantenimiento"
  | "gasto";

export class AccountDocument extends Model<
  InferAttributes<AccountDocument>,
  InferCreationAttributes<AccountDocument>
> {
  declare id: CreationOptional<string>;
  declare tenant_id: string;
  declare tipo: AccountDocumentTipo;
  declare client_id: CreationOptional<string | null>;
  declare supplier_id: CreationOptional<string | null>;
  declare entidad_nombre: string;
  declare folio: string;
  declare concepto: string;
  declare fecha_emision: string;
  declare plazo_credito_dias: CreationOptional<number | null>;
  declare fecha_vencimiento: CreationOptional<string | null>;
  declare monto_original: string;
  declare estatus: AccountDocumentEstatus;
  declare origen: AccountDocumentOrigen;
  declare trip_id: CreationOptional<string | null>;
  declare fuel_ticket_id: CreationOptional<string | null>;
  declare fuel_load_id: CreationOptional<string | null>;
  declare maintenance_record_id: CreationOptional<string | null>;
  declare expense_id: CreationOptional<string | null>;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;

  declare payments?: NonAttribute<AccountDocumentPayment[]>;
}

export function initAccountDocument(sequelize: Sequelize) {
  AccountDocument.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      tenant_id: { type: DataTypes.CHAR(36), allowNull: false },
      tipo: { type: DataTypes.ENUM("cxc", "cxp"), allowNull: false },
      client_id: { type: DataTypes.CHAR(36), allowNull: true },
      supplier_id: { type: DataTypes.CHAR(36), allowNull: true },
      entidad_nombre: { type: DataTypes.STRING(255), allowNull: false },
      folio: { type: DataTypes.STRING(64), allowNull: false },
      concepto: { type: DataTypes.STRING(512), allowNull: false },
      fecha_emision: { type: DataTypes.DATEONLY, allowNull: false },
      plazo_credito_dias: { type: DataTypes.INTEGER, allowNull: true },
      fecha_vencimiento: { type: DataTypes.DATEONLY, allowNull: true },
      monto_original: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      estatus: {
        type: DataTypes.ENUM("abierta", "pagada", "cancelada"),
        allowNull: false,
        defaultValue: "abierta",
      },
      origen: {
        type: DataTypes.ENUM("manual", "viaje", "combustible", "mantenimiento", "gasto"),
        allowNull: false,
        defaultValue: "manual",
      },
      trip_id: { type: DataTypes.CHAR(36), allowNull: true },
      fuel_ticket_id: { type: DataTypes.CHAR(36), allowNull: true },
      fuel_load_id: { type: DataTypes.CHAR(36), allowNull: true },
      maintenance_record_id: { type: DataTypes.CHAR(36), allowNull: true },
      expense_id: { type: DataTypes.CHAR(36), allowNull: true },
    } as never,
    { sequelize, tableName: "account_documents", underscored: true },
  );
}
