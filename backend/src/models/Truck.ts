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
  declare marca: string;
  declare modelo: string;
  declare anio: number;
  declare rendimiento_esperado: string;
  declare costo_km_ref: string;
  declare estatus: "activo" | "taller" | "baja";
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
      marca: { type: DataTypes.STRING(128), allowNull: false },
      modelo: { type: DataTypes.STRING(128), allowNull: false },
      anio: { type: DataTypes.INTEGER, allowNull: false },
      rendimiento_esperado: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      costo_km_ref: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      estatus: { type: DataTypes.ENUM("activo", "taller", "baja"), allowNull: false, defaultValue: "activo" },
    } as never,
    { sequelize, tableName: "trucks", underscored: true },
  );
}
