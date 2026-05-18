import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from "sequelize";

export class TripMercancia extends Model<
  InferAttributes<TripMercancia>,
  InferCreationAttributes<TripMercancia>
> {
  declare id: CreationOptional<string>;
  declare tenant_id: string;
  declare trip_id: string;
  declare descripcion: string;
  declare cantidad: string;
  declare unidad: string;
  declare peso_kg: string;
  declare clave_prod_serv: CreationOptional<string | null>;
  declare material_peligroso: CreationOptional<boolean>;
  declare embalaje: CreationOptional<string | null>;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

export function initTripMercancia(sequelize: Sequelize) {
  TripMercancia.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      tenant_id: { type: DataTypes.CHAR(36), allowNull: false },
      trip_id: { type: DataTypes.CHAR(36), allowNull: false },
      descripcion: { type: DataTypes.STRING(500), allowNull: false },
      cantidad: { type: DataTypes.DECIMAL(14, 4), allowNull: false, defaultValue: 1 },
      unidad: { type: DataTypes.STRING(16), allowNull: false, defaultValue: "H87" },
      peso_kg: { type: DataTypes.DECIMAL(14, 4), allowNull: false },
      clave_prod_serv: { type: DataTypes.STRING(16), allowNull: true },
      material_peligroso: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      embalaje: { type: DataTypes.STRING(32), allowNull: true },
    } as never,
    { sequelize, tableName: "trip_mercancias", underscored: true },
  );
}
