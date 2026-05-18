import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from "sequelize";

export class Tenant extends Model<InferAttributes<Tenant>, InferCreationAttributes<Tenant>> {
  declare id: CreationOptional<string>;
  declare slug: string;
  declare nombre: string;
  declare estatus: "activo" | "suspendido";
  declare logo_url: CreationOptional<string | null>;
  declare color_primary: CreationOptional<string | null>;
  declare color_accent: CreationOptional<string | null>;
  declare color_sidebar: CreationOptional<string | null>;
  declare rfc: CreationOptional<string | null>;
  declare razon_social: CreationOptional<string | null>;
  declare regimen_fiscal: CreationOptional<string | null>;
  declare cp_fiscal: CreationOptional<string | null>;
  declare calle_fiscal: CreationOptional<string | null>;
  declare colonia_fiscal: CreationOptional<string | null>;
  declare municipio_fiscal: CreationOptional<string | null>;
  declare estado_fiscal: CreationOptional<string | null>;
  declare pac_proveedor: CreationOptional<string | null>;
  declare pac_url: CreationOptional<string | null>;
  declare pac_usuario: CreationOptional<string | null>;
  declare pac_token_enc: CreationOptional<string | null>;
  declare csd_cer_path: CreationOptional<string | null>;
  declare csd_key_path: CreationOptional<string | null>;
  declare csd_password_enc: CreationOptional<string | null>;
  declare cfdi_serie: CreationOptional<string | null>;
  declare fuel_proveedor_url: CreationOptional<string | null>;
  declare fuel_proveedor_usuario: CreationOptional<string | null>;
  declare fuel_proveedor_password_enc: CreationOptional<string | null>;
  declare fuel_sync_habilitado: CreationOptional<boolean>;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

export function initTenant(sequelize: Sequelize) {
  Tenant.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      slug: { type: DataTypes.STRING(64), allowNull: false, unique: true },
      nombre: { type: DataTypes.STRING(255), allowNull: false },
      estatus: { type: DataTypes.ENUM("activo", "suspendido"), allowNull: false, defaultValue: "activo" },
      logo_url: { type: DataTypes.TEXT, allowNull: true },
      color_primary: { type: DataTypes.STRING(16), allowNull: true },
      color_accent: { type: DataTypes.STRING(16), allowNull: true },
      color_sidebar: { type: DataTypes.STRING(16), allowNull: true },
      rfc: { type: DataTypes.STRING(13), allowNull: true },
      razon_social: { type: DataTypes.STRING(255), allowNull: true },
      regimen_fiscal: { type: DataTypes.STRING(10), allowNull: true },
      cp_fiscal: { type: DataTypes.STRING(5), allowNull: true },
      calle_fiscal: { type: DataTypes.STRING(255), allowNull: true },
      colonia_fiscal: { type: DataTypes.STRING(128), allowNull: true },
      municipio_fiscal: { type: DataTypes.STRING(128), allowNull: true },
      estado_fiscal: { type: DataTypes.STRING(64), allowNull: true },
      pac_proveedor: { type: DataTypes.STRING(64), allowNull: true },
      pac_url: { type: DataTypes.STRING(512), allowNull: true },
      pac_usuario: { type: DataTypes.STRING(128), allowNull: true },
      pac_token_enc: { type: DataTypes.TEXT, allowNull: true },
      csd_cer_path: { type: DataTypes.STRING(512), allowNull: true },
      csd_key_path: { type: DataTypes.STRING(512), allowNull: true },
      csd_password_enc: { type: DataTypes.TEXT, allowNull: true },
      cfdi_serie: { type: DataTypes.STRING(16), allowNull: true, defaultValue: "CP" },
      fuel_proveedor_url: { type: DataTypes.STRING(512), allowNull: true },
      fuel_proveedor_usuario: { type: DataTypes.STRING(128), allowNull: true },
      fuel_proveedor_password_enc: { type: DataTypes.TEXT, allowNull: true },
      fuel_sync_habilitado: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    } as never,
    { sequelize, tableName: "tenants", underscored: true },
  );
}
