import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from "sequelize";

export type CfdiPagoEstatus = "error" | "timbrado";

export class CfdiPago extends Model<InferAttributes<CfdiPago>, InferCreationAttributes<CfdiPago>> {
  declare id: CreationOptional<string>;
  declare tenant_id: string;
  declare client_id: string;
  declare fecha_pago: Date;
  declare forma_pago_p: string;
  declare moneda_p: string;
  declare tipo_cambio_p: string;
  declare monto: string;
  declare num_operacion: CreationOptional<string | null>;
  declare email: CreationOptional<string | null>;
  declare email_mensaje: CreationOptional<string | null>;
  declare serie: string;
  declare folio: string;
  declare estatus: CfdiPagoEstatus;
  declare uuid: CreationOptional<string | null>;
  declare xml_timbrado: CreationOptional<string | null>;
  declare pdf_path: CreationOptional<string | null>;
  declare timbrado_at: CreationOptional<Date | null>;
  declare error_mensaje: CreationOptional<string | null>;
  declare created_by: CreationOptional<string | null>;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

export function initCfdiPago(sequelize: Sequelize) {
  CfdiPago.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      tenant_id: { type: DataTypes.CHAR(36), allowNull: false },
      client_id: { type: DataTypes.CHAR(36), allowNull: false },
      fecha_pago: { type: DataTypes.DATE, allowNull: false },
      forma_pago_p: { type: DataTypes.STRING(2), allowNull: false },
      moneda_p: { type: DataTypes.STRING(3), allowNull: false },
      tipo_cambio_p: { type: DataTypes.DECIMAL(14, 6), allowNull: false },
      monto: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      num_operacion: { type: DataTypes.STRING(100), allowNull: true },
      email: { type: DataTypes.STRING(255), allowNull: true },
      email_mensaje: { type: DataTypes.TEXT, allowNull: true },
      serie: { type: DataTypes.STRING(16), allowNull: false },
      folio: { type: DataTypes.STRING(32), allowNull: false },
      estatus: { type: DataTypes.ENUM("error", "timbrado"), allowNull: false },
      uuid: { type: DataTypes.STRING(36), allowNull: true },
      xml_timbrado: { type: DataTypes.TEXT("long"), allowNull: true },
      pdf_path: { type: DataTypes.STRING(512), allowNull: true },
      timbrado_at: { type: DataTypes.DATE, allowNull: true },
      error_mensaje: { type: DataTypes.TEXT, allowNull: true },
      created_by: { type: DataTypes.CHAR(36), allowNull: true },
    } as never,
    { sequelize, tableName: "cfdi_pagos", underscored: true },
  );
}
