import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from "sequelize";

export class SatColonia extends Model<
  InferAttributes<SatColonia>,
  InferCreationAttributes<SatColonia>
> {
  declare clave: string;
  declare codigo_postal: string;
  declare nombre: string;
  declare fecha_inicio_vigencia: CreationOptional<string | null>;
  declare fecha_fin_vigencia: CreationOptional<string | null>;
  declare catalogo_version: CreationOptional<string | null>;
  declare imported_at: Date;
}

export function initSatColonia(sequelize: Sequelize) {
  SatColonia.init(
    {
      clave: { type: DataTypes.STRING(16), primaryKey: true },
      codigo_postal: { type: DataTypes.STRING(5), primaryKey: true },
      nombre: { type: DataTypes.STRING(255), allowNull: false },
      fecha_inicio_vigencia: { type: DataTypes.DATEONLY, allowNull: true },
      fecha_fin_vigencia: { type: DataTypes.DATEONLY, allowNull: true },
      catalogo_version: { type: DataTypes.STRING(32), allowNull: true },
      imported_at: { type: DataTypes.DATE, allowNull: false },
    } as never,
    {
      sequelize,
      tableName: "sat_colonias",
      underscored: true,
      timestamps: false,
    },
  );
}
