import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from "sequelize";
import type { SatMaterialPeligroso } from "../utils/cartaPorteSat";

export class SatClaveProducto extends Model<
  InferAttributes<SatClaveProducto>,
  InferCreationAttributes<SatClaveProducto>
> {
  declare clave: string;
  declare descripcion: string;
  declare palabras_similares: CreationOptional<string | null>;
  declare material_peligroso: SatMaterialPeligroso;
  declare fecha_inicio_vigencia: CreationOptional<string | null>;
  declare fecha_fin_vigencia: CreationOptional<string | null>;
  declare catalogo_version: CreationOptional<string | null>;
  declare imported_at: Date;
}

export function initSatClaveProducto(sequelize: Sequelize) {
  SatClaveProducto.init(
    {
      clave: { type: DataTypes.CHAR(8), primaryKey: true },
      descripcion: { type: DataTypes.STRING(512), allowNull: false },
      palabras_similares: { type: DataTypes.TEXT, allowNull: true },
      material_peligroso: {
        type: DataTypes.ENUM("0", "1", "0,1"),
        allowNull: false,
      },
      fecha_inicio_vigencia: { type: DataTypes.DATEONLY, allowNull: true },
      fecha_fin_vigencia: { type: DataTypes.DATEONLY, allowNull: true },
      catalogo_version: { type: DataTypes.STRING(32), allowNull: true },
      imported_at: { type: DataTypes.DATE, allowNull: false },
    } as never,
    {
      sequelize,
      tableName: "sat_claves_productos",
      underscored: true,
      timestamps: false,
    },
  );
}
