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
  declare tipo_figura: CreationOptional<string | null>;
  declare curp: CreationOptional<string | null>;
  declare email: CreationOptional<string | null>;
  declare numero_empleado: CreationOptional<string | null>;
  declare calle: CreationOptional<string | null>;
  declare numero_exterior: CreationOptional<string | null>;
  declare numero_interior: CreationOptional<string | null>;
  declare colonia: CreationOptional<string | null>;
  declare localidad: CreationOptional<string | null>;
  declare municipio: CreationOptional<string | null>;
  declare estado: CreationOptional<string | null>;
  declare cp: CreationOptional<string | null>;
  declare pais: CreationOptional<string | null>;
  declare truck_id: CreationOptional<string | null>;
  declare puesto: CreationOptional<string | null>;
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
      tipo_figura: { type: DataTypes.STRING(2), allowNull: true, defaultValue: "01" },
      curp: { type: DataTypes.STRING(18), allowNull: true },
      email: { type: DataTypes.STRING(255), allowNull: true },
      numero_empleado: { type: DataTypes.STRING(64), allowNull: true },
      calle: { type: DataTypes.STRING(255), allowNull: true },
      numero_exterior: { type: DataTypes.STRING(32), allowNull: true },
      numero_interior: { type: DataTypes.STRING(32), allowNull: true },
      colonia: { type: DataTypes.STRING(128), allowNull: true },
      localidad: { type: DataTypes.STRING(128), allowNull: true },
      municipio: { type: DataTypes.STRING(128), allowNull: true },
      estado: { type: DataTypes.STRING(64), allowNull: true },
      cp: { type: DataTypes.STRING(5), allowNull: true },
      pais: { type: DataTypes.STRING(3), allowNull: true, defaultValue: "MEX" },
      truck_id: { type: DataTypes.CHAR(36), allowNull: true },
      puesto: { type: DataTypes.STRING(128), allowNull: true },
    } as never,
    { sequelize, tableName: "drivers", underscored: true },
  );
}
