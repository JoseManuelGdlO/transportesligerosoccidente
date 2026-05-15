import {
  DataTypes,
  Model,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type Sequelize,
} from "sequelize";

export class DocumentType extends Model<
  InferAttributes<DocumentType>,
  InferCreationAttributes<DocumentType>
> {
  declare id: CreationOptional<string>;
  declare tenant_id: string;
  declare slug: string;
  declare nombre: string;
  declare aplica_a: "operador" | "unidad";
  declare dias_aviso: CreationOptional<number>;
  declare requiere_vigencia: CreationOptional<boolean>;
  declare activo: CreationOptional<boolean>;
  declare readonly createdAt: CreationOptional<Date>;
  declare readonly updatedAt: CreationOptional<Date>;
}

export function initDocumentType(sequelize: Sequelize) {
  DocumentType.init(
    {
      id: { type: DataTypes.CHAR(36), primaryKey: true },
      tenant_id: { type: DataTypes.CHAR(36), allowNull: false },
      slug: { type: DataTypes.STRING(64), allowNull: false },
      nombre: { type: DataTypes.STRING(255), allowNull: false },
      aplica_a: { type: DataTypes.ENUM("operador", "unidad"), allowNull: false },
      dias_aviso: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 30 },
      requiere_vigencia: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    } as never,
    { sequelize, tableName: "document_types", underscored: true },
  );
}
