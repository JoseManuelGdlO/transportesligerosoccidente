import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from "sequelize";
import type { TaxComponent } from "../services/paymentComplement/taxComponent";

export type { TaxComponent };

export class CfdiPagoDocumento extends Model<
  InferAttributes<CfdiPagoDocumento>,
  InferCreationAttributes<CfdiPagoDocumento>
> {
  declare id: CreationOptional<string>;
  declare tenant_id: string;
  declare cfdi_pago_id: string;
  declare account_document_id: string;
  declare carta_porte_id: string;
  declare num_parcialidad: number;
  declare imp_saldo_ant: string;
  declare imp_pagado: string;
  declare imp_saldo_insoluto: string;
  declare moneda_dr: string;
  declare equivalencia_dr: string;
  declare objeto_imp_dr: string;
  declare impuestos: CreationOptional<TaxComponent[]>;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

export function initCfdiPagoDocumento(sequelize: Sequelize) {
  CfdiPagoDocumento.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      tenant_id: { type: DataTypes.CHAR(36), allowNull: false },
      cfdi_pago_id: { type: DataTypes.CHAR(36), allowNull: false },
      account_document_id: { type: DataTypes.CHAR(36), allowNull: false },
      carta_porte_id: { type: DataTypes.CHAR(36), allowNull: false },
      num_parcialidad: { type: DataTypes.INTEGER, allowNull: false },
      imp_saldo_ant: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      imp_pagado: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      imp_saldo_insoluto: { type: DataTypes.DECIMAL(14, 2), allowNull: false },
      moneda_dr: { type: DataTypes.STRING(3), allowNull: false },
      equivalencia_dr: { type: DataTypes.DECIMAL(14, 6), allowNull: false },
      objeto_imp_dr: { type: DataTypes.STRING(2), allowNull: false },
      impuestos: { type: DataTypes.JSON, allowNull: false },
    } as never,
    { sequelize, tableName: "cfdi_pago_documentos", underscored: true },
  );
}
