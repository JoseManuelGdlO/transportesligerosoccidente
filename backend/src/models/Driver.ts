import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from "sequelize";

export class Driver extends Model<InferAttributes<Driver>, InferCreationAttributes<Driver>> {
  declare id: CreationOptional<string>;
  declare tenant_id: string;
  declare nombre: string;
  declare telefono: string;
  declare licencia: string;
  declare fecha_ingreso: string;
  declare comision_tipo: "porcentaje" | "fijo";
  declare comision_valor: string;
  declare comision_valor_local: string;
  declare comision_valor_foraneo: string;
  declare estatus: "activo" | "inactivo";
  declare rfc: CreationOptional<string | null>;
  declare licencia_federal: CreationOptional<string | null>;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

export function initDriver(sequelize: Sequelize) {
  Driver.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      tenant_id: { type: DataTypes.CHAR(36), allowNull: false },
      nombre: { type: DataTypes.STRING(255), allowNull: false },
      telefono: { type: DataTypes.STRING(64), allowNull: false },
      licencia: { type: DataTypes.STRING(64), allowNull: false },
      fecha_ingreso: { type: DataTypes.DATEONLY, allowNull: false },
      comision_tipo: { type: DataTypes.ENUM("porcentaje", "fijo"), allowNull: false },
      comision_valor: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      comision_valor_local: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      comision_valor_foraneo: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      estatus: { type: DataTypes.ENUM("activo", "inactivo"), allowNull: false, defaultValue: "activo" },
      rfc: { type: DataTypes.STRING(13), allowNull: true },
      licencia_federal: { type: DataTypes.STRING(64), allowNull: true },
    } as never,
    { sequelize, tableName: "drivers", underscored: true },
  );
}
