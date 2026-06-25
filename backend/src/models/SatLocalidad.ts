import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from "sequelize";

export class SatLocalidad extends Model<
  InferAttributes<SatLocalidad>,
  InferCreationAttributes<SatLocalidad>
> {
  declare clave: string;
  declare estado: string;
  declare descripcion: string;
  declare fecha_inicio_vigencia: CreationOptional<string | null>;
  declare fecha_fin_vigencia: CreationOptional<string | null>;
  declare catalogo_version: CreationOptional<string | null>;
  declare imported_at: Date;
}

export function initSatLocalidad(sequelize: Sequelize) {
  SatLocalidad.init(
    {
      clave: { type: DataTypes.STRING(16), primaryKey: true },
      estado: { type: DataTypes.STRING(8), primaryKey: true },
      descripcion: { type: DataTypes.STRING(255), allowNull: false },
      fecha_inicio_vigencia: { type: DataTypes.DATEONLY, allowNull: true },
      fecha_fin_vigencia: { type: DataTypes.DATEONLY, allowNull: true },
      catalogo_version: { type: DataTypes.STRING(32), allowNull: true },
      imported_at: { type: DataTypes.DATE, allowNull: false },
    } as never,
    {
      sequelize,
      tableName: "sat_localidades",
      underscored: true,
      timestamps: false,
    },
  );
}
