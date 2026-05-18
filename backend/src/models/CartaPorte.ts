import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from "sequelize";

export type CartaPorteEstatus = "borrador" | "timbrada" | "cancelada" | "error";

export class CartaPorte extends Model<InferAttributes<CartaPorte>, InferCreationAttributes<CartaPorte>> {
  declare id: CreationOptional<string>;
  declare tenant_id: string;
  declare trip_id: string;
  declare estatus: CreationOptional<CartaPorteEstatus>;
  declare uuid: CreationOptional<string | null>;
  declare serie: CreationOptional<string | null>;
  declare folio_cfdi: CreationOptional<string | null>;
  declare xml_timbrado: CreationOptional<string | null>;
  declare pdf_path: CreationOptional<string | null>;
  declare pac_proveedor: CreationOptional<string | null>;
  declare pac_response: CreationOptional<string | null>;
  declare error_mensaje: CreationOptional<string | null>;
  declare timbrado_at: CreationOptional<Date | null>;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

export function initCartaPorte(sequelize: Sequelize) {
  CartaPorte.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      tenant_id: { type: DataTypes.CHAR(36), allowNull: false },
      trip_id: { type: DataTypes.CHAR(36), allowNull: false },
      estatus: {
        type: DataTypes.ENUM("borrador", "timbrada", "cancelada", "error"),
        allowNull: false,
        defaultValue: "borrador",
      },
      uuid: { type: DataTypes.STRING(36), allowNull: true },
      serie: { type: DataTypes.STRING(16), allowNull: true },
      folio_cfdi: { type: DataTypes.STRING(32), allowNull: true },
      xml_timbrado: { type: DataTypes.TEXT("long"), allowNull: true },
      pdf_path: { type: DataTypes.STRING(512), allowNull: true },
      pac_proveedor: { type: DataTypes.STRING(64), allowNull: true },
      pac_response: { type: DataTypes.TEXT, allowNull: true },
      error_mensaje: { type: DataTypes.TEXT, allowNull: true },
      timbrado_at: { type: DataTypes.DATE, allowNull: true },
    } as never,
    { sequelize, tableName: "cartas_porte", underscored: true },
  );
}
