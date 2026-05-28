import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from "sequelize";

export class Truck extends Model<InferAttributes<Truck>, InferCreationAttributes<Truck>> {
  declare id: CreationOptional<string>;
  declare tenant_id: string;
  declare numero_economico: string;
  declare placas: string;
  declare folio_tag: CreationOptional<string | null>;
  declare marca: string;
  declare modelo: string;
  declare anio: number;
  declare rendimiento_esperado: string;
  declare costo_km_ref: string;
  declare estatus: "activo" | "taller" | "baja";
  declare config_vehicular: CreationOptional<string | null>;
  declare perm_sct: CreationOptional<string | null>;
  declare num_permiso_sct: CreationOptional<string | null>;
  declare peso_bruto_vehicular: CreationOptional<string | null>;
  declare aseguradora_resp_civil: CreationOptional<string | null>;
  declare poliza_resp_civil: CreationOptional<string | null>;
  declare vin: CreationOptional<string | null>;
  declare capacidad_carga_kg: CreationOptional<string | null>;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

export function initTruck(sequelize: Sequelize) {
  Truck.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      tenant_id: { type: DataTypes.CHAR(36), allowNull: false },
      numero_economico: { type: DataTypes.STRING(64), allowNull: false },
      placas: { type: DataTypes.STRING(32), allowNull: false },
      folio_tag: { type: DataTypes.STRING(64), allowNull: true },
      marca: { type: DataTypes.STRING(128), allowNull: false },
      modelo: { type: DataTypes.STRING(128), allowNull: false },
      anio: { type: DataTypes.INTEGER, allowNull: false },
      rendimiento_esperado: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      costo_km_ref: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      estatus: { type: DataTypes.ENUM("activo", "taller", "baja"), allowNull: false, defaultValue: "activo" },
      config_vehicular: { type: DataTypes.STRING(16), allowNull: true },
      perm_sct: { type: DataTypes.STRING(16), allowNull: true },
      num_permiso_sct: { type: DataTypes.STRING(64), allowNull: true },
      peso_bruto_vehicular: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
      aseguradora_resp_civil: { type: DataTypes.STRING(128), allowNull: true },
      poliza_resp_civil: { type: DataTypes.STRING(64), allowNull: true },
      vin: { type: DataTypes.STRING(17), allowNull: true },
      capacidad_carga_kg: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
    } as never,
    { sequelize, tableName: "trucks", underscored: true },
  );
}
