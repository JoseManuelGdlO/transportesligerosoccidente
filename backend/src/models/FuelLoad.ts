import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from "sequelize";

export class FuelLoad extends Model<InferAttributes<FuelLoad>, InferCreationAttributes<FuelLoad>> {
  declare id: CreationOptional<string>;
  declare tenant_id: string;
  declare trip_id: string;
  declare litros: string;
  declare precio_litro: string;
  declare ubicacion: string;
  declare es_foraneo: CreationOptional<boolean>;
  declare estacion_nombre: CreationOptional<string | null>;
  declare es_estacion_empresa: CreationOptional<boolean>;
  declare comprobante_url: CreationOptional<string | null>;
  declare fuel_ticket_id: CreationOptional<string | null>;
  declare fecha: Date;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

export function initFuelLoad(sequelize: Sequelize) {
  FuelLoad.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      tenant_id: { type: DataTypes.CHAR(36), allowNull: false },
      trip_id: { type: DataTypes.CHAR(36), allowNull: false },
      litros: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      precio_litro: { type: DataTypes.DECIMAL(12, 4), allowNull: false },
      ubicacion: { type: DataTypes.STRING(255), allowNull: false },
      es_foraneo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      estacion_nombre: { type: DataTypes.STRING(255), allowNull: true },
      es_estacion_empresa: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      comprobante_url: { type: DataTypes.STRING(512), allowNull: true },
      fuel_ticket_id: { type: DataTypes.CHAR(36), allowNull: true },
      fecha: { type: DataTypes.DATE, allowNull: false },
    } as never,
    {
      sequelize,
      tableName: "fuel_loads",
      underscored: true,
      indexes: [
        {
          name: "fuel_loads_tenant_trip_ticket_unique",
          unique: true,
          fields: ["tenant_id", "trip_id", "fuel_ticket_id"],
        },
      ],
    },
  );
}
